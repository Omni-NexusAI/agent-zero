import os

from helpers.api import ApiHandler, Request, Response
from helpers import errors, git

class HealthCheck(ApiHandler):

    @classmethod
    def requires_auth(cls) -> bool:
        return False

    @classmethod
    def requires_csrf(cls) -> bool:
        return False

    @classmethod
    def get_methods(cls) -> list[str]:
        return ["GET", "POST"]

    async def process(self, input: dict, request: Request) -> dict | Response:
        gitinfo = None
        error = None
        try:
            gitinfo = git.get_git_info()
            try:
                from plugins._agentspine_identity.extensions.python._functions.helpers.ui_server.UiRouteHandlers.serve_index.end._10_agentspine_index_identity import _current_release_tag
                from plugins._agentspine_identity.helpers.identity import format_display_version

                display_version = format_display_version(
                    _current_release_tag(),
                    str(gitinfo.get("commit_time", "")) if gitinfo else "",
                )
                gitinfo["agentspine_display_version"] = display_version
                gitinfo["build_variant"] = os.getenv("BUILD_VARIANT", "")
            except Exception:
                pass
        except Exception as e:
            error = errors.error_text(e)

        return {"gitinfo": gitinfo, "error": error}
