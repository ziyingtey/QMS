import { createNavigationContainerRef, type NavigatorScreenParams } from "@react-navigation/native";
import type { BranchDto, ServiceDto } from "../api";

/** When set to `home`, back / Done returns to the Home tab (e.g. booked from Home). */
export type BookingReturnTo = "home" | "branches";

export type BookingStackParamList = {
  BookingBranches: undefined;
  BookingServices: { branch: BranchDto; returnTo?: BookingReturnTo };
  BookingSlots: {
    branch: BranchDto;
    service: ServiceDto;
    rescheduleId?: string;
    returnTo?: BookingReturnTo;
    /** When true, user came from Queue reschedule — no "back to services", exit returns to Queue. */
    rescheduleExitToQueue?: boolean;
  };
};

export type QueueStackParamList = {
  QueueHome: undefined;
  QueueTrack: { branchId: string; ticket: string; bookingId?: string };
};

export type MainTabParamList = {
  Home: undefined;
  Booking: NavigatorScreenParams<BookingStackParamList> | undefined;
  Queue: NavigatorScreenParams<QueueStackParamList> | undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  MapBranches: undefined;
  BranchDetail: { branch: BranchDto };
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
