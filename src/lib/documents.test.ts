import { expect, test } from "bun:test";
import { isDriveUrl } from "./documents";

test("only https Google Drive / Docs links", () => {
  expect(isDriveUrl("https://drive.google.com/drive/folders/abc")).toBe(true);
  expect(isDriveUrl("https://docs.google.com/document/d/abc/edit")).toBe(true);
  expect(isDriveUrl("http://drive.google.com/x")).toBe(false);
  expect(isDriveUrl("https://drive.google.com.evil.com/x")).toBe(false);
  expect(isDriveUrl("https://evil.com/drive.google.com")).toBe(false);
  expect(isDriveUrl("javascript:alert(1)")).toBe(false);
  expect(isDriveUrl("not a url")).toBe(false);
});
