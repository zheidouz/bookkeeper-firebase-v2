// useCreateUser / useAssignRole — TanStack Query mutations that wrap
// the corresponding Firebase Functions callables.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebaseConfig";
import { USERS_QUERY_KEY } from "@/features/users/useUsers";
import type { UserCreateInput, UserRoleInput } from "@/lib/userSchema";

export interface AdminCreateUserResponse {
  uid: string;
  passwordResetLink: string;
}

export interface AssignRoleResponse {
  uid: string;
  role: UserRoleInput["role"];
}

const adminCreateUserFn = httpsCallable<UserCreateInput, AdminCreateUserResponse>(
  functions,
  "adminCreateUser",
);

const assignRoleFn = httpsCallable<UserRoleInput, AssignRoleResponse>(
  functions,
  "assignRole",
);

export function useCreateUser() {
  return useMutation<AdminCreateUserResponse, Error, UserCreateInput>({
    mutationFn: async (input) => {
      const { data } = await adminCreateUserFn(input);
      return data;
    },
  });
}

export function useAssignRole() {
  const qc = useQueryClient();
  return useMutation<AssignRoleResponse, Error, UserRoleInput>({
    mutationFn: async (input) => {
      const { data } = await assignRoleFn(input);
      return data;
    },
    onSuccess: () => {
      // The onSnapshot listener will repopulate the cache; invalidate to
      // trigger any TanStack Query consumers that don't subscribe.
      void qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}