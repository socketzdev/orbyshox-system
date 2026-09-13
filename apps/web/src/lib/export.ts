/**
 * Download data as CSV file from the browser.
 * Used for client-side export of visible table data.
 */
export function downloadCSV(data: Record<string, any>[], columns: { key: string; header: string }[], filename: string): void {
  const header = columns.map(c => c.header).join(',');
  const rows = data.map(row => columns.map(c => {
    const val = row[c.key];
    // Escape commas and quotes
    const str = String(val ?? '');
    return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
  }).join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Trigger server-side CSV export download.
 */
export async function downloadServerCSV(endpoint: string, filename: string): Promise<void> {
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });
    if (!response.ok) throw new Error('Failed to export CSV');
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading CSV:', error);
  }
}
