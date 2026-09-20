import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("sync", Path(__file__).parents[1] / "preview/cloudflare-sync.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class PreviewDnsTest(unittest.TestCase):
    config = {"domain": "nfvd.net", "target": "test.cfargotunnel.com", "cleanup_grace_seconds": 600}

    def record(self, number="103", **overrides):
        return {"id": "id103", "name": f"nb3-{number}.nfvd.net", "type": "CNAME",
                "content": self.config["target"], "proxied": True, "comment": sync.OWNER, **overrides}

    def test_create_and_idempotence(self):
        ops, _ = sync.plan_dns([], {"103"}, self.config, {}, 1000)
        self.assertEqual(ops[0][0], "POST")
        self.assertEqual(ops[0][2]["name"], "nb3-103.nfvd.net")
        self.assertTrue(ops[0][2]["proxied"])
        self.assertEqual(sync.plan_dns([self.record()], {"103"}, self.config, {}, 1000), ([], {}))

    def test_adopt_only_exact_target(self):
        ops, _ = sync.plan_dns([self.record(comment=None)], {"103"}, self.config, {}, 1000)
        self.assertEqual(ops[0][0], "PATCH")
        for record in [self.record(content="someone.example"), self.record(type="A"),
                       self.record(comment="different owner")]:
            with self.assertRaises(RuntimeError):
                sync.plan_dns([record], {"103"}, self.config, {}, 1000)

    def test_conflict_aborts_before_any_mutation(self):
        with self.assertRaises(RuntimeError):
            sync.plan_dns([self.record(content="someone.example")], {"101", "103"}, self.config, {}, 1000)

    def test_cleanup_waits_and_reappearance_resets_grace(self):
        record = self.record()
        ops, missing = sync.plan_dns([record], set(), self.config, {}, 1000)
        self.assertEqual(ops, [])
        self.assertEqual(missing, {"id103": 1000})
        self.assertEqual(sync.plan_dns([record], set(), self.config, missing, 1599)[0], [])
        self.assertEqual(sync.plan_dns([record], set(), self.config, missing, 1600)[0], [("DELETE", "/id103", None)])
        self.assertEqual(sync.plan_dns([record], {"103"}, self.config, missing, 1700), ([], {}))

    def test_cleanup_never_touches_unowned_or_other_dns(self):
        records = [self.record(comment=None), self.record(name="*.nfvd.net"),
                   self.record(name="nb.nfvd.net"), self.record(content="other.example")]
        self.assertEqual(sync.plan_dns(records, set(), self.config, {"id103": 0}, 1000), ([], {}))

    def test_alias_uses_docker_service_and_keeps_main_path(self):
        route = sync.alias_config({"103": "pr103@docker"}, "nfvd.net")["http"]["routers"]["nb3103"]
        self.assertEqual(route, {"rule": "Host(`nb3-103.nfvd.net`)", "entryPoints": ["web"], "service": "pr103@docker", "priority": 1000, "middlewares": ["nb3-root"]})

    def test_redirect_matches_only_bare_origin(self):
        import re
        redirect = sync.alias_config({}, "nfvd.net")["http"]["middlewares"]["nb3-root"]["redirectRegex"]
        self.assertIsNotNone(re.fullmatch(redirect["regex"], "http://nb3-103.nfvd.net/"))
        self.assertIsNone(re.fullmatch(redirect["regex"], "https://nb3-103.nfvd.net/main/api/users"))
        self.assertFalse(redirect["permanent"])


if __name__ == "__main__":
    unittest.main()
