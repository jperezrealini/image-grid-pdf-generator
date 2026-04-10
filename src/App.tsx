"use client";

import { AnimatePresence, motion } from "framer-motion";
import jsPDF from "jspdf";
import { useMemo, useRef, useState } from "react";

interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
}

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_GRID_SIZE = 20;
const MAX_PAGES = 100;

function PDFGridGeneratorContent() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [horizontalCount, setHorizontalCount] = useState<number>(3);
  const [verticalCount, setVerticalCount] = useState<number>(3);
  const [numPages, setNumPages] = useState<number>(1);
  const [pageMargin, setPageMargin] = useState<number>(0);
  const [imagePadding, setImagePadding] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast management
  const showToast = (message: string, type: ToastMessage["type"]) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // Handle image file selection
  const handleImageFile = (file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      showToast("Please upload a valid image file", "error");
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      showToast(
        `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of 10MB.`,
        "error",
      );
      return;
    }

    setImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleImageFile(e.target.files[0]);
    }
    e.target.value = "";
  };

  // Generate PDF
  const generatePDF = async () => {
    if (!imageFile || !imagePreview) {
      showToast("Please upload an image first", "error");
      return;
    }

    if (horizontalCount < 1 || horizontalCount > MAX_GRID_SIZE) {
      showToast(
        `Horizontal count must be between 1 and ${MAX_GRID_SIZE}`,
        "error",
      );
      return;
    }

    if (verticalCount < 1 || verticalCount > MAX_GRID_SIZE) {
      showToast(
        `Vertical count must be between 1 and ${MAX_GRID_SIZE}`,
        "error",
      );
      return;
    }

    if (numPages < 1 || numPages > MAX_PAGES) {
      showToast(`Number of pages must be between 1 and ${MAX_PAGES}`, "error");
      return;
    }

    setIsGenerating(true);

    try {
      // Create PDF in A4 format (210mm x 297mm)
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const margin = pageMargin; // margin in mm
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      // Calculate cell dimensions
      const cellWidth = usableWidth / horizontalCount;
      const cellHeight = usableHeight / verticalCount;

      // Load image
      const img = new Image();
      img.src = imagePreview;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
      });

      // Rasterize one cell tile with object-fit: cover (matches preview)
      const innerWidthMm = cellWidth - imagePadding * 2;
      const innerHeightMm = cellHeight - imagePadding * 2;
      const pxPerMm = 8;
      const tileW = Math.max(1, Math.round(innerWidthMm * pxPerMm));
      const tileH = Math.max(1, Math.round(innerHeightMm * pxPerMm));
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileW;
      tileCanvas.height = tileH;
      const tileCtx = tileCanvas.getContext("2d");
      if (!tileCtx) {
        throw new Error("Could not create canvas for PDF tiles");
      }
      const coverScale = Math.max(tileW / img.width, tileH / img.height);
      const drawW = img.width * coverScale;
      const drawH = img.height * coverScale;
      const drawX = (tileW - drawW) / 2;
      const drawY = (tileH - drawH) / 2;
      tileCtx.drawImage(img, drawX, drawY, drawW, drawH);
      const tileDataUrl = tileCanvas.toDataURL("image/jpeg", 0.92);

      // Generate pages
      const cellsPerPage = horizontalCount * verticalCount;
      const totalCells = cellsPerPage * numPages;

      for (let page = 0; page < numPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // Draw grid for this page
        for (let row = 0; row < verticalCount; row++) {
          for (let col = 0; col < horizontalCount; col++) {
            const x = margin + col * cellWidth;
            const y = margin + row * cellHeight;

            // Draw pre-rasterized cover tile (same as CSS object-fit: cover)
            const imageX = x + imagePadding;
            const imageY = y + imagePadding;

            pdf.addImage(
              tileDataUrl,
              "JPEG",
              imageX,
              imageY,
              innerWidthMm,
              innerHeightMm,
            );

            // Draw cell border
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.1);
            pdf.rect(x, y, cellWidth, cellHeight);
          }
        }
      }

      // Save PDF
      pdf.save(
        `image-grid-${horizontalCount}x${verticalCount}-${numPages}pages.pdf`,
      );
      showToast(
        `PDF generated successfully with ${totalCells} images!`,
        "success",
      );
    } catch (error) {
      console.error("Error generating PDF:", error);
      showToast("Failed to generate PDF. Please try again.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const clearAll = () => {
    setImageFile(null);
    setImagePreview(null);
    setHorizontalCount(3);
    setVerticalCount(3);
    setNumPages(1);
    setPageMargin(0);
    setImagePadding(0);
  };

  // Calculate preview dimensions
  const previewDimensions = useMemo(() => {
    const pageWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const aspectRatio = pageHeight / pageWidth;
    // Account for sidebar layout - preview is in a 2-column grid
    const maxPreviewWidth = 350; // max width in pixels for sidebar
    const availableWidth =
      typeof window !== "undefined"
        ? Math.min(maxPreviewWidth, (window.innerWidth - 96) / 2)
        : maxPreviewWidth;
    const previewWidth = Math.min(maxPreviewWidth, availableWidth);
    const previewHeight = previewWidth * aspectRatio;
    return { width: previewWidth, height: previewHeight };
  }, []);

  // Calculate cell dimensions for preview
  const previewCellDimensions = useMemo(() => {
    const pageWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const margin = pageMargin;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    // Ensure we have valid dimensions
    if (
      usableWidth <= 0 ||
      usableHeight <= 0 ||
      horizontalCount <= 0 ||
      verticalCount <= 0
    ) {
      return {
        cellWidth: 0,
        cellHeight: 0,
        margin: 0,
        padding: 0,
        scale: 0,
      };
    }

    const cellWidth = usableWidth / horizontalCount;
    const cellHeight = usableHeight / verticalCount;

    // Scale to preview size
    const scale = previewDimensions.width / pageWidth;
    return {
      cellWidth: cellWidth * scale,
      cellHeight: cellHeight * scale,
      margin: margin * scale,
      padding: imagePadding * scale,
      scale,
    };
  }, [
    horizontalCount,
    verticalCount,
    pageMargin,
    imagePadding,
    previewDimensions.width,
  ]);

  return (
    <>
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className={`px-4 py-3 rounded-lg shadow-lg text-white min-w-[300px] ${
                toast.type === "success"
                  ? "bg-green-600"
                  : toast.type === "error"
                    ? "bg-red-600"
                    : toast.type === "warning"
                      ? "bg-yellow-600"
                      : "bg-blue-600"
              }`}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="container mx-auto px-6 py-12 max-w-4xl">
          {/* Header */}
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl font-bold mb-4 bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              PDF Grid Generator
            </h1>
            <p className="text-gray-400 text-lg">
              Generate printable PDFs with your image arranged in a grid
            </p>
          </motion.div>

          {/* Main Content */}
          <div className="space-y-8">
            {/* Image Upload Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <h2 className="text-2xl font-semibold mb-4">Upload Image</h2>
              {/* biome-ignore lint/a11y/useSemanticElements: Drag and drop requires div element */}
              <div
                role="region"
                aria-label="Image upload drop zone"
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-all ${
                  dragActive
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-gray-600"
                } ${isGenerating ? "opacity-50 pointer-events-none" : ""}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                {imagePreview ? (
                  <div className="space-y-4">
                    <img
                      src={imagePreview}
                      alt="Uploaded file preview"
                      className="max-w-full max-h-64 mx-auto rounded-lg shadow-lg"
                    />
                    <div className="text-sm text-gray-400">
                      {imageFile?.name} ({(imageFile?.size || 0) / 1024} KB)
                    </div>
                    <motion.button
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Remove Image
                    </motion.button>
                  </div>
                ) : (
                  <>
                    <svg
                      className="mx-auto h-16 w-16 text-gray-500 mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-label="Upload image"
                      role="img"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-gray-400 mb-4">Drop image here or</p>
                    <motion.button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Choose File
                    </motion.button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <p className="text-xs text-gray-500 mt-4">
                      Max 10MB, supports JPG, PNG, GIF, etc.
                    </p>
                  </>
                )}
              </div>
            </motion.div>

            {/* Grid Configuration and Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Grid Configuration */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-gray-800/50 rounded-lg p-6 border border-gray-700"
              >
                <h2 className="text-2xl font-semibold mb-6">
                  Grid Configuration
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Horizontal Count */}
                  <div>
                    <label
                      htmlFor="horizontal-count"
                      className="block text-sm font-medium text-gray-300 mb-2"
                    >
                      Horizontal Count (X)
                    </label>
                    <input
                      id="horizontal-count"
                      type="number"
                      min="1"
                      max={MAX_GRID_SIZE}
                      value={horizontalCount}
                      onChange={(e) =>
                        setHorizontalCount(
                          Math.max(
                            1,
                            Math.min(
                              MAX_GRID_SIZE,
                              parseInt(e.target.value) || 1,
                            ),
                          ),
                        )
                      }
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Images per row</p>
                  </div>

                  {/* Vertical Count */}
                  <div>
                    <label
                      htmlFor="vertical-count"
                      className="block text-sm font-medium text-gray-300 mb-2"
                    >
                      Vertical Count (Y)
                    </label>
                    <input
                      id="vertical-count"
                      type="number"
                      min="1"
                      max={MAX_GRID_SIZE}
                      value={verticalCount}
                      onChange={(e) =>
                        setVerticalCount(
                          Math.max(
                            1,
                            Math.min(
                              MAX_GRID_SIZE,
                              parseInt(e.target.value) || 1,
                            ),
                          ),
                        )
                      }
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Images per column
                    </p>
                  </div>

                  {/* Number of Pages */}
                  <div>
                    <label
                      htmlFor="num-pages"
                      className="block text-sm font-medium text-gray-300 mb-2"
                    >
                      Number of Pages
                    </label>
                    <input
                      id="num-pages"
                      type="number"
                      min="1"
                      max={MAX_PAGES}
                      value={numPages}
                      onChange={(e) =>
                        setNumPages(
                          Math.max(
                            1,
                            Math.min(MAX_PAGES, parseInt(e.target.value) || 1),
                          ),
                        )
                      }
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Total pages to generate
                    </p>
                  </div>
                </div>

                {/* Page Margin and Image Padding */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-gray-700">
                  {/* Page Margin */}
                  <div>
                    <label
                      htmlFor="page-margin"
                      className="block text-sm font-medium text-gray-300 mb-2"
                    >
                      Page Margin (mm)
                    </label>
                    <input
                      id="page-margin"
                      type="number"
                      min="0"
                      step="0.1"
                      value={pageMargin}
                      onChange={(e) =>
                        setPageMargin(
                          Math.max(0, parseFloat(e.target.value) || 0),
                        )
                      }
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Margin around the page edges
                    </p>
                  </div>

                  {/* Image Padding */}
                  <div>
                    <label
                      htmlFor="image-padding"
                      className="block text-sm font-medium text-gray-300 mb-2"
                    >
                      Image Padding (mm)
                    </label>
                    <input
                      id="image-padding"
                      type="number"
                      min="0"
                      step="0.1"
                      value={imagePadding}
                      onChange={(e) =>
                        setImagePadding(
                          Math.max(0, parseFloat(e.target.value) || 0),
                        )
                      }
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Padding inside each cell
                    </p>
                  </div>
                </div>

                {/* Preview Info */}
                <div className="mt-6 p-4 bg-gray-900/50 rounded-lg">
                  <div className="text-sm text-gray-300">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-gray-500">Grid Size:</span>{" "}
                        <span className="font-semibold">
                          {horizontalCount} × {verticalCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Images per Page:</span>{" "}
                        <span className="font-semibold">
                          {horizontalCount * verticalCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Pages:</span>{" "}
                        <span className="font-semibold">{numPages}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Images:</span>{" "}
                        <span className="font-semibold text-blue-400">
                          {horizontalCount * verticalCount * numPages}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* PDF Preview */}
              {imagePreview && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.25 }}
                  className="bg-gray-800/50 rounded-lg p-6 border border-gray-700"
                >
                  <h2 className="text-2xl font-semibold mb-4">PDF Preview</h2>
                  <div className="flex justify-center">
                    <div
                      className="relative bg-white shadow-lg overflow-hidden"
                      style={{
                        width: `${previewDimensions.width}px`,
                        height: `${previewDimensions.height}px`,
                      }}
                    >
                      {/* Page margin background */}
                      {pageMargin > 0 && (
                        <div
                          className="absolute bg-gray-100"
                          style={{
                            left: `${previewCellDimensions.margin}px`,
                            top: `${previewCellDimensions.margin}px`,
                            width: `${
                              previewDimensions.width -
                              previewCellDimensions.margin * 2
                            }px`,
                            height: `${
                              previewDimensions.height -
                              previewCellDimensions.margin * 2
                            }px`,
                          }}
                        />
                      )}

                      {/* Grid cells */}
                      {Array.from(
                        { length: verticalCount * horizontalCount },
                        (_, index) => {
                          const row = Math.floor(index / horizontalCount);
                          const col = index % horizontalCount;
                          const cellId = `cell-${row}-${col}`;
                          const x =
                            previewCellDimensions.margin +
                            col * previewCellDimensions.cellWidth;
                          const y =
                            previewCellDimensions.margin +
                            row * previewCellDimensions.cellHeight;

                          return (
                            <div
                              key={cellId}
                              className="absolute"
                              style={{
                                left: `${x}px`,
                                top: `${y}px`,
                                width: `${previewCellDimensions.cellWidth}px`,
                                height: `${previewCellDimensions.cellHeight}px`,
                                border: "0.1px solid #d1d5db",
                                // boxSizing: "border-box",
                              }}
                            >
                              {/* Image with padding */}
                              <div
                                className="absolute overflow-hidden"
                                style={{
                                  left: `${previewCellDimensions.padding}px`,
                                  top: `${previewCellDimensions.padding}px`,
                                  width: `${
                                    previewCellDimensions.cellWidth -
                                    previewCellDimensions.padding * 2
                                  }px`,
                                  height: `${
                                    previewCellDimensions.cellHeight -
                                    previewCellDimensions.padding * 2
                                  }px`,
                                }}
                              >
                                <img
                                  src={imagePreview}
                                  alt={`Grid cell ${row + 1},${col + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-4">
                    Preview of first page (A4: 210mm × 297mm)
                  </p>
                </motion.div>
              )}
            </div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex gap-4"
            >
              <motion.button
                onClick={generatePDF}
                disabled={!imagePreview || isGenerating}
                className={`flex-1 px-8 py-4 rounded-lg font-semibold text-lg transition-all ${
                  imagePreview && !isGenerating
                    ? "bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
                whileHover={
                  imagePreview && !isGenerating ? { scale: 1.02 } : {}
                }
                whileTap={imagePreview && !isGenerating ? { scale: 0.98 } : {}}
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-label="Loading"
                      role="img"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Generating PDF...
                  </span>
                ) : (
                  "Generate PDF"
                )}
              </motion.button>

              <motion.button
                onClick={clearAll}
                className="px-6 py-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Clear All
              </motion.button>
            </motion.div>

            {/* Instructions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-6"
            >
              <h3 className="text-lg font-semibold mb-2 text-blue-300">
                💡 Instructions
              </h3>
              <ul className="text-sm text-gray-300 space-y-2 list-disc list-inside">
                <li>Upload an image you want to print in a grid format</li>
                <li>
                  Set the horizontal and vertical counts to determine the grid
                  size
                </li>
                <li>Specify how many pages you want to generate</li>
                <li>Click "Generate PDF" to create a printable PDF file</li>
                <li>
                  The PDF will be formatted for A4 paper with cut lines between
                  images
                </li>
              </ul>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return <PDFGridGeneratorContent />;
}
