import { describe, expect, it } from "vitest";
import { prettyName } from "@/lib/food-names";

describe("prettyName", () => {
  it("keeps the food and its variety, moves preparation to detail", () => {
    expect(prettyName("Banana, cavendish, peeled, raw")).toMatchObject({ title: "Banana (cavendish)", detail: "Peeled, raw" });
    expect(prettyName("Apple, pink lady, unpeeled, raw")).toMatchObject({ title: "Apple (pink lady)", detail: "Unpeeled, raw" });
  });

  it("doesn't treat preparation as a variety", () => {
    expect(prettyName("Egg, chicken, whole, boiled")).toMatchObject({ title: "Egg (chicken)", detail: "Whole, boiled" });
    expect(prettyName("Bread, banana, homemade")).toMatchObject({ title: "Bread (banana)", detail: "Homemade" });
    expect(prettyName("Rice, white, boiled")).toMatchObject({ title: "Rice (white)", detail: "Boiled" });
  });

  it("tidies USDA all-caps names", () => {
    expect(prettyName("Cereals ready-to-eat, GENERAL MILLS, CHEERIOS")).toMatchObject({
      title: "Cheerios",
      detail: "General Mills · Cereals ready-to-eat",
    });
  });

  it("leaves simple and branded names readable", () => {
    expect(prettyName("Greek yoghurt")).toMatchObject({ title: "Greek yoghurt", detail: null });
    expect(prettyName("Protein Smoothie+ Chocolate (Dairy Farmers)")).toMatchObject({
      title: "Protein Smoothie+ Chocolate",
      detail: "Dairy Farmers",
    });
    expect(prettyName("Scrambled eggs").full).toBe("Scrambled eggs");
  });
});
