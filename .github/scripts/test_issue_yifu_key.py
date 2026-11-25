import unittest
from unittest.mock import patch

import issue_yifu_key as issue


def ready_state(claim):
    return dict(
        parent=issue.EXPECTED_PARENT,
        entrance=issue.EXPECTED_ENTRANCE,
        modules={
            'entrypoint': 'index.js',
            'modules': issue.EXPECTED_MODULES,
            'claim_binding_referenced': True,
        },
        deploy={
            'id': issue.EXPECTED_RENDER_DEPLOY,
            'status': 'live',
            'commit': {'id': issue.EXPECTED_RENDER_COMMIT},
        },
        management='test-management',
        credentials={'files': []},
        settings={'bindings': [{'name': 'FREE_TOKEN_RENDER_KEY', 'type': 'secret_text'}]},
        keys=[],
        secret={'content': ''},
        claim=claim,
    )


class IssueClaimBaseTest(unittest.TestCase):
    def assert_stops_at_snapshot(self, claim):
        with patch.object(issue, 'snapshot', side_effect=RuntimeError('stopped-after-base-url')):
            with self.assertRaises(RuntimeError) as error:
                issue.issue(ready_state(claim))
        self.assertEqual(str(error.exception), 'stopped-after-base-url')

    def test_missing_claim_uses_render_origin(self):
        self.assert_stops_at_snapshot(None)

    def test_existing_claim_base_url_still_accepted(self):
        claim = {'baseUrl': issue.api.RENDER_ORIGIN + '/v1', 'apiKey': 'sk-not-printed'}
        self.assert_stops_at_snapshot(claim)

    def test_unexpected_claim_base_url_still_rejected(self):
        with patch.object(issue, 'snapshot', side_effect=AssertionError('snapshot-should-not-run')):
            with self.assertRaises(AssertionError) as error:
                issue.issue(ready_state({'baseUrl': 'https://example.invalid/v1'}))
        self.assertNotIn('snapshot-should-not-run', str(error.exception))
        self.assertNotIn('sk-', str(error.exception))

    def test_per_user_body_is_not_treated_as_missing(self):
        with patch.object(issue, 'snapshot', side_effect=AssertionError('snapshot-should-not-run')):
            with self.assertRaises(KeyError):
                issue.issue(ready_state({'ok': True, 'next': 'email'}))


if __name__ == '__main__':
    unittest.main()
