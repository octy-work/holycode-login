import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CopyCode, codeFromHash } from "./copy-code";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("codeFromHash", () => {
  test("keeps letters and digits only, upper-case", () => {
    expect(codeFromHash("#fq6us6")).toBe("FQ6US6");
    expect(codeFromHash("#FQ6%20US6")).toBe("FQ6US6");
    expect(codeFromHash("")).toBe("");
  });
});

describe("CopyCode", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  afterEach(() => {
    cleanup();
    window.location.hash = "";
  });

  test("copies the code on open and shows it", async () => {
    writeText.mockResolvedValue(undefined);
    window.location.hash = "#FQ6US6";
    render(<CopyCode />);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("FQ6US6"));
    expect(screen.getByTestId("copy-code-value")).toHaveTextContent("FQ6US6");
    await waitFor(() => expect(screen.getByTestId("copy-code-status")).toHaveTextContent("copy.copied"));
  });

  test("when the browser refuses on open, the button copies", async () => {
    writeText.mockRejectedValueOnce(new Error("NotAllowedError")).mockResolvedValue(undefined);
    window.location.hash = "#FQ6US6";
    render(<CopyCode />);
    await waitFor(() => expect(screen.getByTestId("copy-code-button")).toHaveTextContent("copy.copy"));
    fireEvent.click(screen.getByTestId("copy-code-button"));
    await waitFor(() => expect(screen.getByTestId("copy-code-button")).toHaveTextContent("copy.copiedButton"));
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  test("no code in the link", async () => {
    render(<CopyCode />);
    await waitFor(() => expect(screen.getByTestId("copy-code-missing")).toBeInTheDocument());
  });
});
