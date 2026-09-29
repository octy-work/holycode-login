import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";
import { CodeInput } from "./code-input";

function Form({ code, length, mode }: { code?: string; length?: number; mode?: "numeric" | "text" }) {
  const { register, watch } = useForm<{ code: string }>({ defaultValues: { code: code ?? "" } });
  return (
    <>
      <CodeInput mode={mode ?? "text"} length={length} {...register("code")} data-testid="code-text-input" />
      <output data-testid="form-value">{watch("code")}</output>
    </>
  );
}

function paste(input: HTMLElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe("CodeInput", () => {
  afterEach(cleanup);

  test("draws the code the form prefilled (link from the e-mail)", () => {
    render(<Form code="FQ6US6" />);
    expect(screen.getByTestId("code-text-input")).toHaveValue("FQ6US6");
    expect(screen.getByTestId("code-cells")).toHaveTextContent("FQ6US6");
  });

  test("paste replaces a full field and picks the code out of a sentence", () => {
    render(<Form code="AAAAAA" />);
    const input = screen.getByTestId("code-text-input");
    paste(input, "(Code fq6us6) If you didn't add");
    expect(input).toHaveValue("FQ6US6");
    expect(screen.getByTestId("code-cells")).toHaveTextContent("FQ6US6");
    expect(screen.getByTestId("form-value")).toHaveTextContent("FQ6US6");
  });

  test("typed letters become upper-case in the form value", () => {
    render(<Form />);
    const input = screen.getByTestId("code-text-input");
    fireEvent.change(input, { target: { value: "fq6" } });
    expect(input).toHaveValue("FQ6");
    expect(screen.getByTestId("form-value")).toHaveTextContent("FQ6");
  });

  test("eight-digit codes fit", () => {
    render(<Form mode="numeric" length={8} />);
    const input = screen.getByTestId("code-text-input");
    paste(input, "12345678");
    expect(input).toHaveValue("12345678");
    expect(screen.getByTestId("code-cells").children).toHaveLength(9); // 8 cells + the input
  });
});
