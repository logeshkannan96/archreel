import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2";
import inter600 from "@fontsource/inter/files/inter-latin-600-normal.woff2";
import inter700 from "@fontsource/inter/files/inter-latin-700-normal.woff2";
import { cancelRender, continueRender, delayRender } from "remotion";

// Bundled Inter, loaded when the component is imported, so renders never depend
// on the machine's fonts — inside archreel's own composition or a host project's.
if (typeof document !== "undefined" && typeof FontFace !== "undefined") {
  const handle = delayRender("Loading the Inter font for archreel");
  const faces = [
    [inter400, "400"],
    [inter600, "600"],
    [inter700, "700"],
  ] as const;
  Promise.all(
    faces.map(async ([url, weight]) => {
      const face = await new FontFace("Inter", `url(${url}) format("woff2")`, { weight }).load();
      document.fonts.add(face);
    }),
  ).then(
    () => {
      continueRender(handle);
    },
    (err: unknown) => {
      cancelRender(err);
    },
  );
}
