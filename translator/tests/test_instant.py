"""Instant translate: home.js posts the form with fetch() and gets JSON back (no page reload)."""
from django.test import TestCase
from django.urls import reverse

from translator.models import Translation

from .helpers import EngineMocksMixin

FETCH = {"HTTP_X_REQUESTED_WITH": "fetch"}


class InstantTranslateTests(EngineMocksMixin, TestCase):
    url = reverse("translator:home")

    def post(self, **data):
        form = {"text": "Hello", "source_lang": "en", "target_lang": "hi", **data}
        return self.client.post(self.url, form, **FETCH)

    def test_success_returns_json_and_saves(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["translated_text"], "नमस्ते")
        self.assertEqual(data["target_name"], "Hindi")
        self.assertEqual(data["engine_name"], "Google")
        self.assertEqual(data["stats"][0], ["Total translations", 1])
        self.assertEqual(Translation.objects.count(), 1)

    def test_json_mode_does_not_leave_a_result_in_the_session(self):
        self.post()
        self.assertNotContains(self.client.get(self.url), "Translated to Hindi")

    def test_auto_detect_info_is_included(self):
        data = self.post(text="Bonjour tout le monde, comment allez-vous aujourd'hui ?", source_lang="auto").json()
        self.assertTrue(data["was_auto_detected"])
        self.assertEqual(data["detection"]["name"], "French")

    def test_validation_errors_return_400(self):
        response = self.post(text="")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Please enter some text to translate.", response.json()["errors"]["text"])
        self.assertEqual(Translation.objects.count(), 0)

    def test_same_language_error_is_a_non_field_error(self):
        errors = self.post(target_lang="en").json()["errors"]
        self.assertIn("same", errors["__all__"][0])

    def test_engine_failure_returns_503_with_message(self):
        self.google.return_value.translate.side_effect = Exception("boom")
        self.mymemory.return_value.translate.side_effect = Exception("boom")
        response = self.post()
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["ok"])
        self.assertTrue(response.json()["error"])
        self.assertEqual(Translation.objects.count(), 0)

    def test_normal_post_still_redirects(self):
        response = self.client.post(self.url, {"text": "Hello", "source_lang": "en", "target_lang": "hi"})
        self.assertRedirects(response, self.url, fetch_redirect_response=False)
