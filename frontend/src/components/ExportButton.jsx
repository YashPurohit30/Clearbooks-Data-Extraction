import React from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { HiDocumentDownload } from "react-icons/hi"; // Icon for export

const ExportButton = ({ data, filename = "data.xlsx" }) => {
  const handleExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, filename);
  };

  return (
    <button
      onClick={handleExport}
      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 flex items-center gap-2 transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={!data?.length}
    >
      <HiDocumentDownload className="w-5 h-5" />
      Export to Excel
    </button>
  );
};

export default ExportButton;