import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Overview",
  description: "Your Quillrun content operations overview.",
};

const App = () => redirect("/sites");

export default App;
