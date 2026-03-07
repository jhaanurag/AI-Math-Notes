export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090d] text-white p-4 text-center">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="text-gray-400 mb-8 max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>
      <a 
        href="/" 
        className="px-6 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
      >
        Go Home
      </a>
    </div>
  );
}
