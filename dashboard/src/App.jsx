import Badge from "./components/Badge";
import Card from "./components/Card";

export default function App() {
  return (
    <div className="min-h-screen p-8 space-y-4">
      <Card hoverable>
        <div className="flex justify-between items-center">
          <span className="font-medium">Fix error handling in auth package</span>
          <Badge variant="completed">completed</Badge>
        </div>
      </Card>

      <Card hoverable>
        <div className="flex justify-between items-center">
          <span className="font-medium">Add rate limiting to webhook endpoint</span>
          <Badge variant="processing">processing</Badge>
        </div>
      </Card>
    </div>
  );
}