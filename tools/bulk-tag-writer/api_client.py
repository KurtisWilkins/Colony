"""
Colony-Main REST API client for jar registration and lookup.
"""

import requests


class ColonyMainAPI:
    """Handles authentication and jar operations against the Colony-Main server."""

    def __init__(self, server_url, username, password):
        self.base = server_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = True
        self._login(username, password)

    def _login(self, username, password):
        resp = self.session.post(
            f"{self.base}/auth/login",
            json={"username_or_email": username, "password": password},
        )
        if resp.status_code != 200:
            raise Exception(f"Login failed (HTTP {resp.status_code}): {resp.text}")

    def register_jar(self, tag_id, jar_defaults):
        """Register a new jar with the given tag ID. Returns jar dict or raises."""
        payload = {
            "tag_id": tag_id,
            "tag_type": jar_defaults.get("tag_type", "nfc_ntag215"),
            "jar_size_ml": jar_defaults.get("jar_size_ml", 1000),
            "jar_material": jar_defaults.get("jar_material", "glass"),
            "lid_type": jar_defaults.get("lid_type", ""),
        }
        resp = self.session.post(f"{self.base}/api/inventory/jars", json=payload)
        if resp.status_code == 409:
            return {"already_registered": True, "jar": resp.json()}
        if resp.status_code not in (200, 201):
            raise Exception(f"Registration failed (HTTP {resp.status_code}): {resp.text}")
        return resp.json()

    def get_jar_by_tag(self, tag_id):
        """Look up a jar by tag ID. Returns jar dict or None."""
        resp = self.session.get(f"{self.base}/api/inventory/jars/by-tag/{tag_id}")
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "unknown_tag":
                return None
            return data
        return None

    def retire_jar(self, jar_id, reason="tag_reassigned"):
        """Retire a jar so its tag can be reused."""
        resp = self.session.post(
            f"{self.base}/api/inventory/jars/{jar_id}/retire",
            json={"reason": reason},
        )
        return resp.status_code in (200, 201)

    def get_stats(self):
        """Get inventory dashboard summary."""
        resp = self.session.get(f"{self.base}/api/inventory/analytics/dashboard-summary")
        if resp.status_code == 200:
            return resp.json()
        return {}
