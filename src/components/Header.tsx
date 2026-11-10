interface HeaderProps {
  onNavigateHome: () => void;
}

export function Header({ onNavigateHome }: HeaderProps) {
  return (
    <header className="w-full flex justify-end items-center py-4 border-b border-neutral-200 mb-8">
      <button
        type="button"
        onClick={onNavigateHome}
        className="text-lg font-bold tracking-tight text-neutral-900 hover:text-blue-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 rounded"
      >
        DataDrop
      </button>
    </header>
  );
}
