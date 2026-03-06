// SettingsPage — user preferences and API key management.
// Will contain: Anthropic API key input (stored in IndexedDB via db.settings),
// display preferences, and build version info.

export default function SettingsPage() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>

      {/* API key input: stored in IndexedDB as a Setting { key: "apiKey", value: "..." }
          The key is only used for direct browser-to-API calls the user explicitly triggers. */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Anthropic API Key
        </label>
        <p className="mb-2 text-sm text-gray-500">
          Your API key is stored locally and never sent to any server except
          Anthropic&apos;s API.
        </p>
        <input
          type="password"
          placeholder="sk-ant-..."
          className="w-full rounded border px-3 py-2"
          readOnly
        />
      </div>

      {/* Display preferences: will include options for analysis detail level,
          overlay visibility, etc. */}

      <p className="mt-8 text-xs text-gray-400">Build: {__BUILD_TIMESTAMP__}</p>
    </div>
  );
}
