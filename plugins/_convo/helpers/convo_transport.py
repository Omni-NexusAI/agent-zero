"""Only configured sidecars receive audio; browsers cannot select endpoints."""
from __future__ import annotations

import json

import httpx

from .convo_contract import ContractError, credentials, endpoint


class Sidecar:
    def __init__(self, config):
        self.url = endpoint(config)
        self.headers = credentials(config)
        if not self.headers:
            raise ContractError("Set CONVO_SIDECAR_TOKEN in both host and sidecar before starting Convo")

    async def policy(self, payload):
        async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
            response = await client.post(self.url + "/policy", json=payload, headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def health(self):
        async with httpx.AsyncClient(timeout=5, follow_redirects=False, trust_env=False) as client:
            response = await client.get(self.url + '/health', headers=self.headers)
            response.raise_for_status()
            data = response.json()
            if data.get('service') != 'convo' or data.get('protocol') != 1:
                raise ContractError('Incompatible Convo sidecar')
            return data

    async def studio(self, payload):
        async with httpx.AsyncClient(timeout=190, follow_redirects=False, trust_env=False) as client:
            route = '/preview' if payload.get('operation') == 'preview' else '/studio'
            response = await client.post(self.url + route, json=payload.get('payload') if route == '/preview' else payload, headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def freeze_speech(self, role):
        async with httpx.AsyncClient(timeout=15, follow_redirects=False, trust_env=False) as client:
            response = await client.post(self.url + '/freeze-speech', json=role, headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def answer(self, payload):
        async with httpx.AsyncClient(timeout=httpx.Timeout(65, connect=5), follow_redirects=False, trust_env=False) as client:
            async with client.stream("POST", self.url + "/answer", json=payload, headers=self.headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data:"):
                        yield json.loads(line[5:])

    async def speech(self, role, text):
        async with httpx.AsyncClient(timeout=35, follow_redirects=False, trust_env=False) as client:
            async with client.stream("POST", self.url + "/speech", json={"role": role, "text": text}, headers=self.headers) as response:
                response.raise_for_status()
                parts, size = [], 0
                async for part in response.aiter_bytes():
                    size += len(part)
                    if size > 16 * 1024 * 1024:
                        raise ContractError("Speech response too large")
                    parts.append(part)
                return b"".join(parts)
