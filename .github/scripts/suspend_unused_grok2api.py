"""Suspend only the retired grok2api service and verify CPA stays unchanged."""
import json
import os
import time

import yifu_key_api as api


TARGET = 'srv-d779u3mdqaus73blfk2g'


def main():
    target = api.render('/services/' + TARGET)
    assert TARGET != api.SERVICE
    assert target['id'] == TARGET and target['name'] == 'grok2api'
    assert target['ownerId'] == api.WORKSPACE
    assert target['serviceDetails']['url'] == 'https://grok2api-07gc.onrender.com'
    cpa_before = api.render('/services/' + api.SERVICE)
    deploy_before = api.latest_deploy()['id']
    assert cpa_before['suspended'] == 'not_suspended'
    health_before = api.request(api.RENDER_ORIGIN + '/healthz')[0]
    assert health_before == 200

    if target['suspended'] != 'suspended':
        status, _, _ = api.request(
            'https://api.render.com/v1/services/' + TARGET + '/suspend', 'POST',
            headers={'Authorization': 'Bearer ' + os.environ['RENDER_API_KEY'].strip()})
        assert status in (200, 202, 204), 'Suspend request was not accepted'
    else:
        status = None
    for _ in range(12):
        after = api.render('/services/' + TARGET)
        if after['suspended'] == 'suspended':
            break
        time.sleep(2)
    assert after['suspended'] == 'suspended', 'Suspension has not completed'

    cpa_after = api.render('/services/' + api.SERVICE)
    assert cpa_after['suspended'] == 'not_suspended'
    assert api.latest_deploy()['id'] == deploy_before, 'CPA deploy changed concurrently'
    assert cpa_after['updatedAt'] == cpa_before['updatedAt'], 'CPA settings changed concurrently'
    health_after = api.request(api.RENDER_ORIGIN + '/healthz')[0]
    assert health_after == 200
    print('GROK2API_SUSPEND=' + json.dumps({
        'service': TARGET, 'name': after['name'], 'suspended': after['suspended'],
        'request_http': status, 'deleted': False,
        'cpa_service': api.SERVICE, 'cpa_suspended': cpa_after['suspended'],
        'cpa_deploy_unchanged': True, 'cpa_settings_unchanged': True,
        'cpa_health_before': health_before, 'cpa_health_after': health_after,
        'cpa_deploy': deploy_before,
    }))


if __name__ == '__main__':
    main()
