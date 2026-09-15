import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { csvCell } from './csv.util';

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
}

export interface ExportSheet {
  name: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
}

@Injectable()
export class ExportService {
  /** Build CSV string with UTF-8 BOM for Excel Arabic compatibility. */
  toCsv(columns: ExportColumn[], rows: Record<string, unknown>[]): string {
    const bom = '\uFEFF';
    const header = columns.map((c) => csvCell(c.header)).join(',');
    const lines = rows.map((row) =>
      columns.map((c) => csvCell(row[c.key])).join(','),
    );
    return bom + [header, ...lines].join('\r\n');
  }

  /** Build multi-sheet XLSX buffer. */
  async toXlsx(sheets: ExportSheet[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Noamany Fitness Center';
    for (const sheet of sheets) {
      const ws = wb.addWorksheet(sheet.name.slice(0, 31));
      ws.columns = sheet.columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width ?? 18,
      }));
      ws.getRow(1).font = { bold: true };
      for (const row of sheet.rows) {
        ws.addRow(row);
      }
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /** Send CSV as downloadable attachment. */
  sendCsv(res: Response, filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]) {
    const csv = this.toCsv(columns, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /** Send XLSX as downloadable attachment. */
  async sendXlsx(res: Response, filename: string, sheets: ExportSheet[]) {
    const buf = await this.toXlsx(sheets);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  }
}
