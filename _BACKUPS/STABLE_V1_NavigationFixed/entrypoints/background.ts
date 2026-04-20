type DownloadMessage = {
  type: 'DOWNLOAD';
  url: string;
  filename?: string;
};

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (message: DownloadMessage, _sender, sendResponse: (r: { downloadId?: number; error?: string }) => void) => {
      if (message.type !== 'DOWNLOAD') return;

      chrome.downloads.download(
        {
          url: message.url,
          filename: message.filename,
          saveAs: false,
        },
        (downloadId) => {
          sendResponse({
            downloadId,
            error: chrome.runtime.lastError?.message,
          });
        }
      );
      return true;
    }
  );
});
