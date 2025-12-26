interface AudioLoadingStateProps {
  progress?: number;
  isLoading: boolean;
  hasLoaded: boolean;
}

export const AudioLoadingState = ({
  progress,
  isLoading,
  hasLoaded
}: AudioLoadingStateProps) => {
  if (!isLoading && hasLoaded) return null;

  return (
    <div className="relative flex justify-center items-center h-full">
      <div className="flex items-center justify-center z-50">
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-8 max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4">
            {isLoading ? "Loading Audio..." : "Audio Ready"}
          </h3>

          {isLoading ? (
            <>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-4 mb-4">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Loading audio files... {Math.round(progress || 0)}%
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-2">
                Placeholder
              </p>
            </>
          ) : (
            <div className="text-center">
              <div className="text-green-600 dark:text-green-400 text-4xl mb-4">
                ✓
              </div>
              <p className="text-neutral-700 dark:text-neutral-300">
                Audio loaded successfully!
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-2">
                Click play to start listening with real audio inserts.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
