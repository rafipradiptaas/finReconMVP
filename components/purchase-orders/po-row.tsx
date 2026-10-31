'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

export type PoLine = {
  id: string;
  line_no: number;
  item_description: string;
  quantity: number;
  unit_price: number;
};

export type Po = {
  id: string;
  po_number: string;
  po_date: string;
  currency: string;
  total_amount: number;
  vendor_name: string;
  lines: PoLine[];
};

const number = new Intl.NumberFormat('id-ID');

export function PoRow({ po }: { po: Po }) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <>
      <TableRow>
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            aria-expanded={open}
            aria-label={`Baris PO ${po.po_number}`}
            onClick={() => setOpen(!open)}
          >
            <Icon />
          </Button>
        </TableCell>
        <TableCell className="font-medium">{po.po_number}</TableCell>
        <TableCell>{po.vendor_name}</TableCell>
        <TableCell>{po.po_date}</TableCell>
        <TableCell>{po.lines.length}</TableCell>
        <TableCell className="text-right">
          {po.currency} {number.format(po.total_amount)}
        </TableCell>
      </TableRow>
      {open &&
        po.lines.map((line) => (
          <TableRow key={line.id} className="bg-muted/30">
            <TableCell />
            <TableCell>Baris {line.line_no}</TableCell>
            <TableCell colSpan={2}>{line.item_description}</TableCell>
            <TableCell>{number.format(line.quantity)}</TableCell>
            <TableCell className="text-right">
              {po.currency} {number.format(line.unit_price)}
            </TableCell>
          </TableRow>
        ))}
    </>
  );
}
