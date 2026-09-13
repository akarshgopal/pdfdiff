import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_TITLE,
  INDEXABLE_ROBOTS,
  NOT_FOUND_ROBOTS,
  ROUTE_DOCUMENT_META,
  appRouteFromPath,
  canonicalPathForRoute,
  documentMetaForRoute,
} from "../app/pdfdiff/routes.ts";

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

test("canonical path is the route, not the homepage, including unknown URLs", () => {
  assert.equal(canonicalPathForRoute("home", "/"), "/");
  assert.equal(canonicalPathForRoute("privacy", "/privacy"), "/privacy");
  assert.equal(canonicalPathForRoute("terms", "/terms/"), "/terms");
  assert.equal(canonicalPathForRoute("not-found", "/no-such-page"), "/no-such-page");
  assert.equal(canonicalPathForRoute("not-found", "/privacy/extra/"), "/privacy/extra");
});

test("document meta points canonical and robots at the current route", () => {
  const origin = "https://pdfdiff.app";
  const home = documentMetaForRoute("home", origin, "/");
  assert.equal(home.canonicalUrl, "https://pdfdiff.app/");
  assert.equal(home.robots, INDEXABLE_ROBOTS);
  assert.equal(home.title, HOME_TITLE);

  const privacy = documentMetaForRoute("privacy", origin, "/privacy");
  assert.equal(privacy.canonicalUrl, "https://pdfdiff.app/privacy");
  assert.equal(privacy.title, ROUTE_DOCUMENT_META.privacy.title);
  assert.equal(privacy.description, ROUTE_DOCUMENT_META.privacy.description);
  assert.equal(privacy.robots, INDEXABLE_ROBOTS);

  const missing = documentMetaForRoute("not-found", origin, "/old-docs");
  assert.equal(missing.canonicalUrl, "https://pdfdiff.app/old-docs");
  assert.equal(missing.robots, NOT_FOUND_ROBOTS);
  assert.match(missing.title, /Page not found/);
});
