"""Allowlisted controls for the fixed Convo-owned audio service only."""
import copy
import re

import httpx

from ..helpers.convo_contract import ContractError, credentials


READS = {'health': '/health', 'models': '/v1/backend/models', 'profiles': '/v1/voices/profiles', 'tuning': '/v1/tuning/profiles', 'export_tuning': '/v1/tuning/export', 'catalog': '/convo/catalog'}
WRITES = {'load': ('POST', '/v1/backend/models/switch'), 'unload': ('POST', '/v1/backend/models/unload'), 'create_profile': ('POST', '/v1/voices/profiles'), 'create_tuning': ('POST', '/v1/tuning/profiles'), 'import_tuning': ('POST', '/v1/tuning/import'), 'select_tuning': ('PUT', '/v1/tuning/selection')}
ITEMS = {'profile': ('GET', '/v1/voices/profiles/'), 'edit_profile': ('PATCH', '/v1/voices/profiles/'), 'select_profile': ('POST', '/v1/voices/profiles/'), 'edit_tuning': ('PATCH', '/v1/tuning/profiles/')}


async def control(operation, payload=None, *, confirmed=False, item_id=''):
    body = payload or {}
    if operation in READS: method, path = 'GET', READS[operation]
    elif operation == 'download':
        method, path = 'POST', '/convo/download'
        if body.get('action') not in {'inspect', 'status'} and not confirmed: raise ContractError('Confirm download action')
        body = {**body, 'confirmed': confirmed}
    elif operation in WRITES:
        if not confirmed: raise ContractError('Explicit Studio action required')
        method, path = WRITES[operation]
    elif operation in ITEMS:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}', item_id): raise ContractError('Invalid profile identity')
        method, path = ITEMS[operation]; path += item_id
        if operation == 'select_profile': path += '/select'
        if method != 'GET' and not confirmed: raise ContractError('Explicit Studio action required')
    else: raise ContractError('Unsupported Studio operation')
    headers = credentials({'token_env': 'CONVO_AUDIO_TOKEN'})
    if not headers: raise ContractError('Managed audio is not configured; external services cannot be controlled')
    async with httpx.AsyncClient(timeout=180 if operation == 'load' else 25, follow_redirects=False, trust_env=False) as client:
        async with client.stream(method, 'http://convo-audio:8080' + path, headers=headers, json=body if method != 'GET' else None) as response:
            response.raise_for_status()
            parts, size = [], 0
            async for part in response.aiter_bytes():
                size += len(part)
                if size > 12 * 1024**2: raise ContractError('Studio response exceeded limit')
                parts.append(part)
            import json
            return json.loads(b''.join(parts))


async def freeze(role):
    frozen = copy.deepcopy(role)
    models = await control('models')
    if role.get('model') not in models.get('loaded_models', []): raise ContractError('Explicitly load the selected Convo audio model first')
    voice = role.get('voice', '')
    if not voice.startswith('clone:'): raise ContractError('Managed Base output requires an explicit clone profile')
    profile = await control('profile', item_id=voice[6:])
    frozen['clone_snapshot'] = copy.deepcopy({key: profile[key] for key in ('profile_id', 'content_revision', 'content_hash', 'ref_audio', 'ref_text', 'reference_excerpts')})
    frozen['expected_engine_epoch'] = models['engineEpoch']
    frozen['expected_supervisor_instance_id'] = models['supervisorInstanceId']
    # The pinned engine supports Base cloning, not VoiceDesign/CustomVoice. The
    # application does not infer those controls from the model family's name.
    frozen.update(url='http://convo-audio:8080/v1', token_env='CONVO_AUDIO_TOKEN', remote=False,
                  capabilities={'audio_output': True, 'cloning': True, 'cancellation': True})
    frozen['instructions'] = ''
    return frozen
