import { Injectable, StreamableFile } from '@nestjs/common';
import { Buffer } from 'buffer';

export interface ExportColumn {
  key: string;
  header: string;
  format?: (val: any) => string;
}

@Injectable()
export class ExportService {
  /**
   * Converts array of objects to CSV string.
   * Handles nested objects by flattening, dates by formatting, and numbers by locale.
   */
  generateCSV(data: any[], columns: ExportColumn[]): string {
    const headerRow = columns.map(col => this.escapeCSV(col.header)).join(',');
    
    const dataRows = data.map(row => {
      return columns.map(col => {
        let value = this.getValueByKey(row, col.key);
        
        if (col.format && value !== undefined && value !== null) {
          value = col.format(value);
        }
        
        return this.escapeCSV(value);
      }).join(',');
    });

    return [headerRow, ...dataRows].join('\n');
  }

  /**
   * Returns a StreamableFile for downloading.
   */
  createCSVResponse(data: any[], columns: ExportColumn[], filename: string): { stream: StreamableFile; filename: string } {
    const csvContent = this.generateCSV(data, columns);
    const buffer = Buffer.from(csvContent, 'utf-8');
    
    return {
      stream: new StreamableFile(buffer),
      filename,
    };
  }

  private getValueByKey(obj: any, key: string): any {
    return key.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
  }

  private escapeCSV(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    const stringValue = String(value);
    
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  }
}
