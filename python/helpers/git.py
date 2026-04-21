from git import Repo, Git
from dataclasses import dataclass
from datetime import datetime
import os
import re
import subprocess
import base64
from urllib.parse import urlparse, urlunparse
from python.helpers import files


# --- Release info dataclasses (used by self_update) ---

@dataclass
class GitRemoteReleaseInfo:
    tag: str
    commit_hash: str
    short_commit_hash: str
    released_at: str


@dataclass
class GitRemoteReleasesResult:
    is_git_repo: bool
    is_remote: bool
    author: str
    repo: str
    releases: list[GitRemoteReleaseInfo]
    error: str = ""


def get_remote_releases(author: str, repo: str) -> GitRemoteReleasesResult:
    """Query remote GitHub repo for tags/releases via git ls-remote."""
    try:
        author = author.strip()
        repo = repo.strip()

        if not author or not repo:
            return GitRemoteReleasesResult(
                is_remote=False, is_git_repo=False,
                author=author, repo=repo, releases=[],
                error="Both author and repo are required.",
            )

        remote_url = f"https://github.com/{author}/{repo}.git"
        env = os.environ.copy()
        env['GIT_TERMINAL_PROMPT'] = '0'

        try:
            output = Git().ls_remote('--tags', '--refs', '--', remote_url,
                                     with_extended_output=False, env=env)
        except Exception as e:
            return GitRemoteReleasesResult(
                is_remote=True, is_git_repo=False,
                author=author, repo=repo, releases=[],
                error=f"Git remote query failed: {str(e)}",
            )

        releases: list[GitRemoteReleaseInfo] = []
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) != 2:
                continue
            commit_hash, ref_name = parts
            prefix = 'refs/tags/'
            if not ref_name.startswith(prefix):
                continue
            tag_name = ref_name[len(prefix):]
            releases.append(GitRemoteReleaseInfo(
                tag=tag_name, commit_hash=commit_hash,
                short_commit_hash=commit_hash[:7], released_at="",
            ))

        releases.sort(key=lambda r: r.tag, reverse=True)
        return GitRemoteReleasesResult(
            is_git_repo=True, is_remote=True,
            author=author, repo=repo, releases=releases,
        )
    except Exception as e:
        return GitRemoteReleasesResult(
            is_git_repo=False, is_remote=False,
            author=author, repo=repo, releases=[], error=str(e),
        )


@dataclass
class GitHeadInfo:
    hash: str
    committed_at: str


@dataclass
class GitRepoReleaseInfo:
    is_git_repo: bool
    author: str
    repo: str
    head: GitHeadInfo | None = None


@dataclass
class GitRemoteCommitsSinceLocal:
    commits_since_local: int = 0
    last_remote_commit_at: str = ""
    branch: str = ""
    remote_branch: str = ""
    is_git_repo: bool = False
    is_remote: bool = False
    error: str = ""


def _parse_github_author_repo(remote_url: str) -> tuple[str, str]:
    """Extract (author, repo) from a GitHub remote URL."""
    url = remote_url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    # SSH: git@github.com:Author/Repo
    m = re.match(r"git@github\.com:([^/]+)/(.+)", url)
    if m:
        return m.group(1), m.group(2)
    # HTTPS: https://github.com/Author/Repo
    m = re.match(r"https?://github\.com/([^/]+)/(.+)", url)
    if m:
        return m.group(1), m.group(2)
    return "", ""


def get_repo_release_info(repo_path: str) -> GitRepoReleaseInfo:
    """Inspect a local git repo and return author, repo name, and HEAD commit info."""
    try:
        repo = Repo(repo_path)
    except Exception:
        return GitRepoReleaseInfo(is_git_repo=False, author="", repo="")

    if repo.bare:
        return GitRepoReleaseInfo(is_git_repo=False, author="", repo="")

    author, repo_name = "", ""
    try:
        if repo.remotes:
            remote_url = repo.remotes.origin.url
            author, repo_name = _parse_github_author_repo(remote_url)
    except Exception:
        pass

    head_info = None
    try:
        commit = repo.head.commit
        committed_at = datetime.fromtimestamp(commit.committed_date).strftime("%Y-%m-%d %H:%M")
        head_info = GitHeadInfo(hash=commit.hexsha[:7], committed_at=committed_at)
    except Exception:
        pass

    return GitRepoReleaseInfo(
        is_git_repo=True,
        author=author,
        repo=repo_name,
        head=head_info,
    )


def get_remote_commits_since_local(repo_path: str) -> GitRemoteCommitsSinceLocal:
    """Compare local HEAD vs remote tracking branch and return the commit diff count."""
    try:
        repo = Repo(repo_path)
    except Exception:
        return GitRemoteCommitsSinceLocal(error="Not a git repository")

    if repo.bare:
        return GitRemoteCommitsSinceLocal(error="Repository is bare")

    try:
        if repo.head.is_detached:
            branch_name = f"HEAD@{repo.head.commit.hexsha[:7]}"
        else:
            branch_name = repo.active_branch.name
    except Exception:
        branch_name = "unknown"

    tracking = None
    try:
        if not repo.head.is_detached:
            tracking = repo.active_branch.tracking_branch()
    except Exception:
        pass

    if tracking is None:
        return GitRemoteCommitsSinceLocal(
            is_git_repo=True,
            is_remote=False,
            branch=branch_name,
        )

    remote_branch_name = str(tracking)

    try:
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        remote_name = tracking.remote_name
        with repo.git.custom_environment(**env):
            repo.remotes[remote_name].fetch()
    except Exception:
        pass

    try:
        behind_commits = list(repo.iter_commits(f"HEAD..{tracking}"))
        commits_since_local = len(behind_commits)
        last_remote_commit_at = ""
        if behind_commits:
            last_ts = behind_commits[0].committed_date
            last_remote_commit_at = datetime.fromtimestamp(last_ts).strftime("%Y-%m-%d %H:%M")
    except Exception:
        commits_since_local = 0
        last_remote_commit_at = ""

    return GitRemoteCommitsSinceLocal(
        commits_since_local=commits_since_local,
        last_remote_commit_at=last_remote_commit_at,
        branch=branch_name,
        remote_branch=remote_branch_name,
        is_git_repo=True,
        is_remote=True,
    )


def strip_auth_from_url(url: str) -> str:
    """Remove any authentication info from URL."""
    if not url:
        return url
    parsed = urlparse(url)
    if not parsed.hostname:
        return url
    clean_netloc = parsed.hostname
    if parsed.port:
        clean_netloc += f":{parsed.port}"
    return urlunparse((parsed.scheme, clean_netloc, parsed.path, '', '', ''))


def get_git_info():
    # Get the current working directory (assuming the repo is in the same folder as the script)
    repo_path = files.get_base_dir()
    
    # Open the Git repository
    repo = Repo(repo_path)

    # Ensure the repository is not bare
    if repo.bare:
        raise ValueError(f"Repository at {repo_path} is bare and cannot be used.")

    # Get the current branch name
    branch = repo.active_branch.name if repo.head.is_detached is False else ""

    # Get the latest commit hash
    commit_hash = repo.head.commit.hexsha

    # Get the commit date (ISO 8601 format)
    commit_time = datetime.fromtimestamp(repo.head.commit.committed_date).strftime('%y-%m-%d %H:%M')

    # Get the latest tag description (if available)
    short_tag = ""
    try:
        tag = repo.git.describe(tags=True)
        tag_split = tag.split('-')
        if len(tag_split) >= 3:
            short_tag = "-".join(tag_split[:-1])
        else:
            short_tag = tag
    except:
        tag = ""

    version = branch[0].upper() + " " + ( short_tag or commit_hash[:7] )

    # Create the dictionary with collected information
    git_info = {
        "branch": branch,
        "commit_hash": commit_hash,
        "commit_time": commit_time,
        "tag": tag,
        "short_tag": short_tag,
        "version": version
    }

    return git_info

def get_version():
    try:
        git_info = get_git_info()
        return str(git_info.get("short_tag", "")).strip() or "unknown"
    except Exception:
        return "unknown"


def clone_repo(url: str, dest: str, token: str | None = None):
    """Clone a git repository. Uses http.extraHeader for token auth (never stored in URL/config)."""
    cmd = ['git']
    
    if token:
        # GitHub Git HTTP requires Basic Auth, not Bearer
        auth_string = f"x-access-token:{token}"
        auth_base64 = base64.b64encode(auth_string.encode()).decode()
        cmd.extend(['-c', f'http.extraHeader=Authorization: Basic {auth_base64}'])
    
    cmd.extend(['clone', '--progress', '--', url, dest])
    
    env = os.environ.copy()
    env['GIT_TERMINAL_PROMPT'] = '0'
    
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    
    if result.returncode != 0:
        error_msg = result.stderr.strip() or result.stdout.strip() or 'Unknown error'
        raise Exception(f"Git clone failed: {error_msg}")
    
    return Repo(dest)


def update_repo(repo_path: str) -> Repo:
    """Pull latest changes for the current branch from its tracking remote."""
    repo = Repo(repo_path)
    if repo.bare:
        raise ValueError(f"Repository at {repo_path} is bare and cannot be updated.")

    if repo.head.is_detached:
        raise ValueError("Repository HEAD is detached.")

    branch = repo.active_branch.name
    tracking_branch = repo.active_branch.tracking_branch()
    if tracking_branch is None:
        raise ValueError("Current branch has no tracking remote branch.")

    env = os.environ.copy()
    env['GIT_TERMINAL_PROMPT'] = '0'

    with repo.git.custom_environment(**env):
        repo.remotes[tracking_branch.remote_name].pull(branch)

    return repo


# Files to ignore when checking dirty status (A0 project metadata)
A0_IGNORE_PATTERNS = {".a0proj", ".a0proj/"}


def get_repo_status(repo_path: str) -> dict:
    """Get Git repository status, ignoring A0 project metadata files."""
    try:
        repo = Repo(repo_path)
        if repo.bare:
            return {"is_git_repo": False, "error": "Repository is bare"}
        
        # Remote URL (always strip auth info for security)
        remote_url = ""
        try:
            if repo.remotes:
                remote_url = strip_auth_from_url(repo.remotes.origin.url)
        except Exception:
            pass
        
        # Current branch
        try:
            current_branch = repo.active_branch.name if not repo.head.is_detached else f"HEAD@{repo.head.commit.hexsha[:7]}"
        except Exception:
            current_branch = "unknown"
        
        # Check dirty status, excluding A0 metadata
        def is_a0_file(path: str) -> bool:
            return path.startswith(".a0proj") or path == ".a0proj"
        
        # Filter out A0 files from diff and untracked
        changed_files = [d.a_path for d in repo.index.diff(None)] + [d.a_path for d in repo.index.diff("HEAD")]
        untracked = repo.untracked_files
        
        real_changes = [f for f in changed_files if not is_a0_file(f)]
        real_untracked = [f for f in untracked if not is_a0_file(f)]
        
        is_dirty = len(real_changes) > 0 or len(real_untracked) > 0
        untracked_count = len(real_untracked)
        
        last_commit = None
        try:
            commit = repo.head.commit
            last_commit = {
                "hash": commit.hexsha[:7],
                "message": commit.message.split('\n')[0][:80],
                "author": str(commit.author),
                "date": datetime.fromtimestamp(commit.committed_date).strftime('%Y-%m-%d %H:%M')
            }
        except Exception:
            pass
        
        return {
            "is_git_repo": True,
            "remote_url": remote_url,
            "current_branch": current_branch,
            "is_dirty": is_dirty,
            "untracked_count": untracked_count,
            "last_commit": last_commit
        }
    except Exception as e:
        return {"is_git_repo": False, "error": str(e)}