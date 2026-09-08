from __future__ import annotations

import importlib
from pathlib import Path

from helpers.api import ApiHandler, Request


def module():
    root = Path(__file__).resolve().parent.parent
    prefix = "usr.plugins" if root.parent.parent.name == "usr" else "plugins"
    return importlib.import_module(prefix + "._convo.helpers.convo_service")


class Conversation(ApiHandler):
    async def process(self, input: dict, request: Request) -> dict:
        action = input.get("action", "status")
        m = module()
        if action == "status":
            config = m.settings()
            contract = importlib.import_module(m.__package__ + ".convo_contract")
            return {"ok": True, "settings": contract.public_settings(config), "version": "0.1.0", "live_validated": False}
        if action == 'studio':
            config = m.settings()
            if config['sidecar'].get('remote'):
                raise ValueError('Managed Studio requires a local Convo sidecar')
            s = m.service()
            if input.get('operation') == 'preview' and input.get('confirmed') is not True:
                raise ValueError('Explicit preview request required')
            with s.store.lock:
                if input.get('confirmed') is True and s.store.db.execute('SELECT 1 FROM sessions WHERE active=1').fetchone():
                    raise ValueError('Stop Convo before changing models, profiles or tuning')
            transport = importlib.import_module(m.__package__ + '.convo_transport')
            result = await transport.Sidecar(config['sidecar']).studio({key: input.get(key) for key in ('operation','payload','confirmed','item_id')})
            # Profile reference audio and backend credentials stay server-side.
            def public(value):
                if isinstance(value, dict): return {k: public(v) for k,v in value.items() if k not in {'ref_audio','authorization','token','token_env'}}
                if isinstance(value, list): return [public(v) for v in value]
                return value
            return {'ok': True, 'data': public(result)}
        migration = importlib.import_module(m.__package__ + ".convo_migration")
        if action in {"migration_preview", "migrate", "rollback"}:
            root = m.runtime_root() / "usr" / "plugins"
            result = migration.rollback(root) if action == "rollback" else migration.migrate(root, apply=action == "migrate")
            return {"ok": True, **result}
        s = m.service()
        target = str(input.get("target", ""))
        s.host.context(target)
        if action == "history":
            return {"ok": True, "events": s.store.events(target, int(input.get("after", 0))), "jobs": s.store.jobs(target)}
        if action in {"cancel_job", "steer_job"}:
            job = s.store.job(str(input.get("job_id", "")))
            if job["target"] != target:
                raise ValueError("Job belongs to another chat")
            if action == "cancel_job":
                s.dispatcher.cancel(job["id"])
            else:
                text = str(input.get("text", "")).strip()
                if not text or len(text) > 16000:
                    raise ValueError("Provide a bounded steering instruction")
                s.dispatcher.steer(job["id"], text)
            return {"ok": True, "job": s.store.job(job["id"])}
        raise ValueError("Unsupported Convo operation")
