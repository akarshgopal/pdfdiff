import assert from "node:assert/strict";
import test from "node:test";
import { HOME_DESCRIPTION, HOME_TITLE, ROUTE_DOCUMENT_META, appRouteFromPath } from "../app/pdfdiff/routes.ts";

test("appRouteFromPath maps landing, legal, and unknown paths", () => {
  assert.equal(appRouteFromPath("/"), "home");
  assert.equal(appRouteFromPath(""), "home");
  assert.equal(appRouteFromPath("/privacy"), "privacy");
  assert.equal(appRouteFromPath("/privacy/"), "privacy");
  assert.equal(appRouteFromPath("/terms"), "terms");
  assert.equal(appRouteFromPath("/terms/"), "terms");
  assert.equal(appRouteFromPath("/no-such-page"), "not-found");
  assert.equal(appRouteFromPath("/privacy/extra"), "not-found");
});

test("each route has a distinct title and description", () => {
  const titles = Object.values(ROUTE_DOCUMENT_META).map((meta) => meta.title);
  const descriptions = Object.values(ROUTE_DOCUMENT_META).map((meta) => meta.description);
  assert.equal(new Set(titles).size, titles.length);
  assert.equal(new Set(descriptions).size, descriptions.length);
  assert.equal(ROUTE_DOCUMENT_META.home.title, HOME_TITLE);
  assert.equal(ROUTE_DOCUMENT_META.home.description, HOME_DESCRIPTION);
  assert.match(ROUTE_DOCUMENT_META.privacy.title, /Privacy Policy/);
  assert.match(ROUTE_DOCUMENT_META.terms.title, /Terms of Service/);
  assert.match(ROUTE_DOCUMENT_META["not-found"].title, /Page not found/);
});
