"use server";

import { z } from "zod";
import { db } from "../db";
import { getProfile } from "../repo";
import { currentProfileId, forgetProfile, isUuid, rememberProfile, requireProfileId } from "../session";
import type { Profile, ProfileSettings } from "@/lib/types";

export async function listProfiles(): Promise<{ id: string; name: string }[]> {
  return (await db()).query(`select id, name from profiles order by created_at, name`);
}

export async function selectProfile(id: string) {
  if (!isUuid(id) || !(await getProfile(id))) throw new Error("Profile not found");
  await rememberProfile(id);
}

export async function createProfile(name: string) {
  const clean = z.string().trim().min(1).max(40).parse(name);
  const rows = await (await db()).query<{ id: string }>(`insert into profiles (name) values ($1) returning id`, [clean]);
  await rememberProfile(rows[0].id);
  return rows[0].id;
}

/** The profile this device is using, or null (the client then shows the picker). */
export async function getMe(): Promise<Profile | null> {
  const id = await currentProfileId();
  if (!id) return null;
  await rememberProfile(id); // slide the cookie expiry forward
  return getProfile(id);
}

export async function switchProfile() {
  await forgetProfile();
}

const Settings = z.object({
  name: z.string().trim().min(1).max(40),
  sex: z.enum(["male", "female"]).nullable(),
  birth_date: z.iso.date().nullable(),
  height_cm: z.number().min(50).max(272).nullable(),
  activity_level: z.enum(["sedentary", "light", "moderate", "very", "extra"]),
  goal: z.enum(["cut", "maintain", "recomp", "bulk"]),
  energy_unit: z.enum(["kj", "kcal"]),
  training_days_per_week: z.number().int().min(0).max(7),
  ai_enabled: z.boolean(),
  calendar_ics_url: z
    .url({ protocol: /^https$/ })
    .max(2000)
    .nullable(),
  calendar_keywords: z.string().max(500),
  remind_log_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable(),
  remind_workouts: z.boolean(),
});

export async function saveProfile(input: ProfileSettings): Promise<Profile> {
  const pid = await requireProfileId();
  const p = Settings.parse(input);
  await (
    await db()
  ).query(
    `update profiles set name=$2, sex=$3, birth_date=$4, height_cm=$5, activity_level=$6, goal=$7, energy_unit=$8,
       training_days_per_week=$9, ai_enabled=$10, calendar_ics_url=$11, calendar_keywords=$12, remind_log_time=$13, remind_workouts=$14
     where id = $1`,
    [
      pid,
      p.name,
      p.sex,
      p.birth_date,
      p.height_cm,
      p.activity_level,
      p.goal,
      p.energy_unit,
      p.training_days_per_week,
      p.ai_enabled,
      p.calendar_ics_url,
      p.calendar_keywords,
      p.remind_log_time,
      p.remind_workouts,
    ],
  );
  return (await getProfile(pid))!;
}
