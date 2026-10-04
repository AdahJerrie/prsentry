// src/components/Card.jsx

export default function Card({ children, className = "", hoverable = false }) {
  return (
    <div
      className={`bg-bg-secondary border border-border rounded-lg p-4 ${
        hoverable ? "hover:bg-bg-tertiary transition-colors cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}