import { useState, useEffect } from "react";
import { parseSRT, fixSubtitles, buildSRT } from "./engine/srt";
import { isForbiddenSplit } from "./engine/rules";
import "./App.css";




function visibleLength(s: string): number {
  return s.replace(/(\{[^}]*\}|<[^>]+>)/g, "").length;
}

function isBadSplit(lines: string[]): boolean {
  if (lines.length !== 2) return false;

  const left = lines[0].trim();
  const right = lines[1].trim();

  if (!left || !right) return true;

  const leftWords = left.split(/\s+/);
  const rightWords = right.split(/\s+/);

  const lastLeft = leftWords[leftWords.length - 1].toLowerCase();
  const firstRight = rightWords[0].toLowerCase();

  const BAD_WORDS = ["and", "but", "or", "so"];

  // ❌ Line ends with conjunction
  if (BAD_WORDS.includes(lastLeft)) return true;

  // ❌ Next line starts with conjunction
  if (BAD_WORDS.includes(firstRight)) return true;

  // ❌ Linguistically glued split (from your rules engine)
  if (isForbiddenSplit(lastLeft, firstRight)) return true;

  // ❌ Too short first or second line (ugly pyramid)
  if (leftWords.length < 2 || rightWords.length < 2) return true;

  return false;
}


interface PreviewBlock {
  index: number;
  time: string;
  lines: string[];
  isInvalid: boolean;
  isSplit: boolean;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "warning";
}

// Helper interface for the parser/fixer objects


export default function App() {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<PreviewBlock[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    invalid: 0,
    valid: 0,
    split: 0
  });
  const [currentTab, setCurrentTab] = useState<"all" | "errors" | "fixed">("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);


const [showDevPopup, setShowDevPopup] = useState(true);


  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const showToast = (message: string, type: "success" | "error" | "warning" = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const calculateStats = (blocks: PreviewBlock[]) => {
    const total = blocks.length;
    const invalid = blocks.filter(b => b.isInvalid).length;
    const valid = blocks.filter(b => !b.isInvalid && !b.isSplit).length;
    const split = blocks.filter(b => b.isSplit).length;
    setStats({ total, invalid, valid, split });
  };

  function analyze() {
    setIsLoading(true);
    setTimeout(() => {
     try {
  const parsed = parseSRT(input);

  const analyzed: PreviewBlock[] = parsed.map((s) => {
let invalid =
  s.text.length > 2 ||
  s.text.some((l) => visibleLength(l) > 42);

if (s.text.length === 2 && isBadSplit(s.text)) {
  invalid = true;
}

    return {
      index: s.index,
      time: s.time,
      lines: s.text,
      isInvalid: invalid,
      isSplit: false,
    };
  });

  setPreview(analyzed);
  calculateStats(analyzed);
  showToast("Analysis complete", "success");
} catch (error) {
  showToast("Invalid SRT format", "error");
} finally {
  setIsLoading(false);
}
    }, 500);
  }

  function fixOne(originalIndex: number) {
    setIsLoading(true);
    setTimeout(() => {
      try {
        // STRATEGY: Use the current 'preview' state as the source of truth
        // because it holds the 'isSplit' memory of previous fixes.
        
        // 1. Get the target block from the current preview state
        const targetBlock = preview[originalIndex];
        if (!targetBlock) throw new Error("Subtitle not found");

        // 2. Convert it to the format the fixer engine expects
        const srtObjectToFix = {
            index: targetBlock.index,
            time: targetBlock.time,
            text: targetBlock.lines
        };

        // 3. Run the fix logic on just this one item
        const fixedResult = fixSubtitles([srtObjectToFix]);

        // 4. Convert the fixed result back into PreviewBlocks
        // These are the "new" blocks replacing the old one. 
        // We explicitly mark them as fixed (isSplit: true)
        const newBlocks: PreviewBlock[] = fixedResult.map(s => ({
            index: 0, // temp, will re-index later
            time: s.time,
            lines: s.text,
            isInvalid: false, // will re-validate later
            isSplit: true // KEY: Mark this specific fix as 'Fixed'
        }));

        // 5. Insert the new blocks into the existing preview array
        // We use slice to keep the OLD items (with their isSplit status) untouched
        const updatedPreviewList = [
            ...preview.slice(0, originalIndex),
            ...newBlocks,
            ...preview.slice(originalIndex + 1)
        ];

        // 6. Re-process the ENTIRE list to:
        //    a) Fix indices (1, 2, 3...)
        //    b) Re-run validation logic (so errors stay red)
        const finalPreviewList = updatedPreviewList.map((block, i) => {
            // Update Index
            const newIndex = i + 1;

            // --- Re-run Validation Logic ---
            let invalid =
              block.lines.length > 2 ||
              block.lines.some((l) => visibleLength(l) > 42);

            
            
            // -------------------------------

            return {
                ...block,
                index: newIndex,
                isInvalid: invalid,
                // We keep the existing isSplit status! 
                // If it was true before, it stays true.
                isSplit: block.isSplit 
            };
        });

        // 7. Update Preview State
        setPreview(finalPreviewList);
        calculateStats(finalPreviewList);

        // 8. Update the Input Text String to match the new list
        const srtObjectsForBuild = finalPreviewList.map(b => ({
            index: b.index,
            time: b.time,
            text: b.lines
        }));
        setInput(buildSRT(srtObjectsForBuild));

        showToast("Subtitle fixed successfully", "success");

      } catch (error) {
        console.error(error);
        showToast("Error fixing subtitle", "error");
      } finally {
        setIsLoading(false);
      }
    }, 400);
  }

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(input).then(() => {
      showToast("Copied to clipboard", "success");
    }).catch(() => {
      showToast("Failed to copy", "error");
    });
  };

  const downloadSRT = () => {
    const element = document.createElement("a");
    const file = new Blob([input], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "subtitles.srt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast("File downloaded", "success");
  };

  const clearAll = () => {
    setInput("");
    setPreview([]);
    setStats({ total: 0, invalid: 0, valid: 0, split: 0 });
    setCurrentTab("all");
    showToast("Cleared all content", "success");
  };

  const goToNextError = () => {
    const currentIndex = preview.findIndex(b => b.isInvalid);
    if (currentIndex !== -1) {
      const nextIndex = preview.findIndex((b, i) => i > currentIndex && b.isInvalid);
      const targetIndex = nextIndex !== -1 ? nextIndex : currentIndex;
      const element = document.querySelector(`[data-index="${preview[targetIndex].index}"]`);
      element?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const goToNextFixed = () => {
    const currentIndex = preview.findIndex(b => b.isSplit);
    if (currentIndex !== -1) {
      const nextIndex = preview.findIndex((b, i) => i > currentIndex && b.isSplit);
      const targetIndex = nextIndex !== -1 ? nextIndex : currentIndex;
      const element = document.querySelector(`[data-index="${preview[targetIndex].index}"]`);
      element?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div
  className="app"
  style={{
    backgroundColor: "#0f172a",
    color: "#e5e7eb",
    minHeight: "100vh"
  }}
>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
                <line x1="6" y1="9" x2="18" y2="9"></line>
                <line x1="6" y1="15" x2="12" y2="15"></line>
              </svg>
            </div>
            <h1 className="logo-text">Subtitle Editor Pro</h1>
          </div>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>








        <div className="stats-grid">
          <div className="stat-card total">
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total</div>
            </div>
          </div>
          <div className="stat-card invalid">
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.invalid}</div>
              <div className="stat-label">Errors</div>
            </div>
          </div>
          <div className="stat-card valid">
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.valid}</div>
              <div className="stat-label">Valid</div>
            </div>
          </div>
          <div className="stat-card split">
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.split}</div>
              <div className="stat-label">Fixed</div>
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button className="action-btn primary" onClick={analyze} disabled={isLoading || !input}>
            {isLoading ? (
              <div className="btn-spinner"></div>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
            )}
            Analyze
          </button>
        </div>

        <div className="tools-section">
          <h3>Tools</h3>
          <div className="tool-buttons">
            <button className="tool-btn" onClick={copyToClipboard}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </button>
            <button className="tool-btn" onClick={downloadSRT}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </button>
            <button className="tool-btn" onClick={clearAll}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Clear
            </button>
            <button className="tool-btn" onClick={toggleTheme}>
              {theme === "light" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              )}
              Theme
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Input Section */}
        <div className="input-section">
          <div className="section-header">
            <h2>Input Subtitles</h2>
            <div className="input-actions">
              <button className="icon-btn" onClick={copyToClipboard} title="Copy">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button className="icon-btn" onClick={downloadSRT} title="Download">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button className="icon-btn" onClick={clearAll} title="Clear">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div className="input-container">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste your SRT content here..."
              className="input-textarea"
            />
          </div>
        </div>

        {/* Preview Section */}
        <div className="preview-section">
          <div className="section-header">
            <h2>Preview</h2>
            {preview.length > 0 && (
              <div className="preview-controls">
                <div className="tab-group">
                  <button 
                    className={`tab ${currentTab === "all" ? "active" : ""}`} 
                    onClick={() => setCurrentTab("all")}
                  >
                    All ({stats.total})
                  </button>
                  <button 
                    className={`tab ${currentTab === "errors" ? "active" : ""}`} 
                    onClick={() => setCurrentTab("errors")}
                  >
                    Errors ({stats.invalid})
                  </button>
                  <button 
                    className={`tab ${currentTab === "fixed" ? "active" : ""}`} 
                    onClick={() => setCurrentTab("fixed")}
                  >
                    Fixed ({stats.split})
                  </button>
                </div>
                <div className="nav-controls">
                  <button className="nav-btn" onClick={goToNextError} disabled={stats.invalid === 0}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    Next Error
                  </button>
                  <button className="nav-btn" onClick={goToNextFixed} disabled={stats.split === 0}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Next Fixed
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="preview-container">
            {preview.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <h3>No subtitles to preview</h3>
                <p>Paste SRT content and click "Analyze" to get started</p>
              </div>
            ) : (
              <div className="subtitle-list">
                {preview.filter(b => {
                  if (currentTab === "errors") return b.isInvalid;
                  if (currentTab === "fixed") return b.isSplit;
                  return true;
                }).map((b,i) => (
                  <div
                    key={b.index}
                    data-index={b.index}
                    className={`subtitle-card ${b.isInvalid ? 'invalid' : ''} ${b.isSplit ? 'split' : ''}`}
                  >
                    <div className="card-header">
                      <div className="card-index">#{b.index}</div>
                      <div className="card-time">{b.time}</div>
                      {b.isInvalid && (
                        <button className="fix-btn" onClick={() => fixOne(i)} disabled={isLoading}>
                          Fix
                        </button>
                      )}
                    </div>
                    <div className="card-content">
                      {b.lines.map((l, j) => (
                        <div key={j} className="subtitle-line">
                          <span className="line-text">{l}</span>
                            <span
                              className={`line-counter ${
                                visibleLength(l) > 42 ? "danger" :
                                visibleLength(l) > 35 ? "warning" : ""
                              }`}
                            >
                            {l.replace(/(\{[^}]*\}|<[^>]+>)/g, "").length}/42
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <div className="toast-icon">
              {toast.type === "success" && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
              {toast.type === "error" && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              )}
              {toast.type === "warning" && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              )}
            </div>
            <span className="toast-message">{toast.message}</span>
          </div>
        ))}
      </div>

 {showDevPopup && (
  <div className="dev-popup-backdrop">
    <div className="dev-popup">
      <h2>🚧 Development Notice</h2>
      <p>
        This website is currently in an active development phase.
        <br />
        Please verify all subtitle corrections carefully
        before final use.
      </p>

      <button
        className="dev-popup-btn"
        onClick={() => setShowDevPopup(false)}

      >
        I Understand
      </button>
    </div>
  </div>
)}



    </div>
  );

 
}