import { expect, test } from "bun:test";
import { escapeLike } from "./utils";

test("escapeLike makes LIKE wildcards literal", () => {
  expect(escapeLike("ana_pop@think-up.academy")).toBe("ana\\_pop@think-up.academy");
  expect(escapeLike("100%")).toBe("100\\%");
  expect(escapeLike("a\\b")).toBe("a\\\\b");
  expect(escapeLike("plain")).toBe("plain");
});
