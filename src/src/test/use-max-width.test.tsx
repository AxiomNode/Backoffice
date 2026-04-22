import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMaxWidth } from "../ui/hooks/useMaxWidth";

function Probe({ maxWidth }: { maxWidth: number }) {
  const matches = useMaxWidth(maxWidth);
  return <p>{matches ? "match" : "no-match"}</p>;
}

describe("useMaxWidth", () => {
  it("tracks whether the viewport stays under the configured threshold", () => {
    window.innerWidth = 900;

    render(<Probe maxWidth={800} />);

    expect(screen.getByText("no-match")).toBeInTheDocument();

    window.innerWidth = 720;
    fireEvent(window, new Event("resize"));

    expect(screen.getByText("match")).toBeInTheDocument();
  });
});