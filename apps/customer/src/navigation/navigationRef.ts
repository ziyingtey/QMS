import { createNavigationContainerRef, type NavigatorScreenParams } from "@react-navigation/native";
import type { BookingCreated, BranchDto, ServiceDto } from "../api";

export type BookingStackParamList = {
  BookingBranches: undefined;
  BookingServices: { branch: BranchDto };
  BookingSlots: { branch: BranchDto; service: ServiceDto; rescheduleId?: string };
  BookingTicket: { created: BookingCreated; branchId: string };
};

export type QueueStackParamList = {
  QueueHome: undefined;
  QueueTrack: { branchId: string; ticket: string };
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
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
