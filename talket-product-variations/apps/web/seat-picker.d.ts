declare module "react-seat-picker" {
  import type { Component } from "react";

  type SeatCell = {
    id: string | number;
    number: string | number;
    tooltip?: string;
    isSelected?: boolean;
    isReserved?: boolean;
  } | null;

  type SeatPick = { row: string; number: string | number; id: string | number };

  type Accept = (row: string, number: string | number, id?: string | number, tooltip?: string | null) => void;

  export default class SeatPicker extends Component<{
    rows: SeatCell[][];
    alpha?: boolean;
    visible?: boolean;
    maxReservableSeats?: number;
    addSeatCallback?: (seat: SeatPick, accept: Accept) => void;
    removeSeatCallback?: (seat: SeatPick, accept: Accept) => void;
  }> {}
}
