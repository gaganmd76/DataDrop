interface FooterProps {
  onNavigateAbout: () => void;
}

export function Footer({ onNavigateAbout }: FooterProps) {
  return (
    <footer className="w-full flex justify-between items-center py-6 mt-12 border-t border-neutral-200 text-xs text-neutral-500">
      <div className="flex items-center gap-1.5">
        <span>© DataDrop 2026</span>
        <span>·</span>
        <span className="font-mono text-neutral-400">E2EE</span>
        <span>·</span>
        <button
          type="button"
          onClick={onNavigateAbout}
          className="hover:text-neutral-900 underline underline-offset-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-neutral-400 rounded"
        >
          About
        </button>
      </div>
      <div>Dev: GVC</div>
    </footer>
  );
}
