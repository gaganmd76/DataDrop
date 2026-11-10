import { useState, type FormEvent } from 'react';

interface HomePageProps {
  onStartCreate: () => void;
  onOpenDrop: (key: string) => void;
}

export function HomePage({ onStartCreate, onOpenDrop }: HomePageProps) {
  const [lookupKey, setLookupKey] = useState('');
  const [showLookup, setShowLookup] = useState(false);

  const handleLookupSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = lookupKey.trim().toLowerCase().replace(/^\/+/, '');
    if (trimmed) {
      onOpenDrop(trimmed);
    }
  };

  return (
    <div className="w-full flex flex-col justify-center py-6 sm:py-10">

      {/* Main Title & Subtitle */}
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 leading-tight mb-2 text-center">
        DataDrop
      </h1>

      <p className="text-sm text-neutral-600 leading-relaxed mb-8 text-center">
        Temporary, minimal file sharing.
      </p>


      {/* Primary Action Button */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={onStartCreate}
          className="w-full py-3.5 px-6 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-white font-medium text-base rounded cursor-pointer min-h-[48px] focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          Create Drop
        </button>

        {/* Existing Drop Lookup Toggle */}
        {!showLookup ? (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowLookup(true)}
              className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2 cursor-pointer focus:outline-none"
            >
              Have a drop key? Open it here
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleLookupSubmit}
            className="p-3 border border-neutral-200 rounded bg-white space-y-2"
          >
            <label
              htmlFor="lookup-key"
              className="block text-xs font-semibold text-neutral-700"
            >
              Enter drop key:
            </label>
            <div className="flex gap-2">
              <input
                id="lookup-key"
                type="text"
                value={lookupKey}
                onChange={(e) => setLookupKey(e.target.value)}
                placeholder="e.g. blue-tiger-42"
                required
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded whitespace-nowrap cursor-pointer"
              >
                Open
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
