import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAcquisitionChannel, referrerDomain } from "../src/lib/analytics/channels.ts";

test("classifyAcquisitionChannel groups paid and organic", () => {
  assert.equal(
    classifyAcquisitionChannel({ referrer: null, utmSource: "google", utmMedium: "cpc" }),
    "Paid Search",
  );
  assert.equal(
    classifyAcquisitionChannel({ referrer: "https://www.google.com/search?q=people", utmSource: null, utmMedium: null }),
    "Organic Search",
  );
  assert.equal(classifyAcquisitionChannel({ referrer: null, utmSource: null, utmMedium: null }), "Direct");
  assert.equal(referrerDomain("https://news.ycombinator.com/item"), "news.ycombinator.com");
});
