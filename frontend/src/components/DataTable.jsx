import React from "react";

const DataTable = ({ data }) => {
  if (!data || data.length === 0) return <p className="text-gray-400">No data found.</p>;

  const headers = Object.keys(data[0]);

  return (
    <div className="overflow-x-auto bg-gray-800 shadow-lg rounded-lg p-4 mt-4 border border-gray-700">
      <table className="min-w-full border border-gray-600 text-sm text-gray-200">
        <thead className="bg-gray-700">
          <tr>
            {headers.map((key) => (
              <th key={key} className="border border-gray-600 px-4 py-3 text-left font-semibold text-gray-100">
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-700 transition-colors">
              {headers.map((key) => (
                <td key={key} className="border border-gray-600 px-4 py-3">
                  {String(row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;