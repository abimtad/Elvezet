type ReceiptLineItem = {
  label: string;
  amount: number;
};

type ReceiptInput = {
  merchantName: string;
  date: Date;
  customerName?: string;
  lines: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  total: number;
  reference?: string;
  bookingReference?: string;
  paymentMethod?: string;
};

const currency = (value: number): string => `ETB ${value.toFixed(2)}`;

export const formatReceipt = (input: ReceiptInput): string => {
  const header = [
    input.merchantName,
    new Date(input.date).toLocaleString(),
    input.customerName ? `Customer: ${input.customerName}` : undefined,
    input.reference ? `Receipt: ${input.reference}` : undefined,
    input.bookingReference ? `Booking: ${input.bookingReference}` : undefined,
    input.paymentMethod ? `Payment method: ${input.paymentMethod}` : undefined,
    "Payment recorded",
    "--------------------------------",
  ].filter(Boolean);

  const items = input.lines.flatMap((line) => {
    const subtotal = line.quantity * line.unitPrice;
    return [
      `${line.quantity} x ${line.name}`,
      `  ${currency(line.unitPrice)} -> ${currency(subtotal)}`,
    ];
  });

  return [...header, ...items, "--------------------------------", `TOTAL: ${currency(input.total)}`].join("\n");
};
