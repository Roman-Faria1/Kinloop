import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string | null | undefined) {
  if (!address) return "No mailing address on file yet.";
  return address.replaceAll("\n", ", ");
}
