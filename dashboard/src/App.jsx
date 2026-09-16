import Badge from "./components/Badge";

export default function App() {
  return (
    <div className="min-h-screen p-8 flex gap-2 flex-wrap">
      <Badge variant="completed">completed</Badge>
      <Badge variant="processing">processing</Badge>
      <Badge variant="failed">failed</Badge>
      <Badge variant="low">low</Badge>
      <Badge variant="medium">medium</Badge>
      <Badge variant="high">high</Badge>
    </div>
  );
}