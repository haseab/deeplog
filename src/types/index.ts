export type TimeEntry = {
  id: number;
  description: string;
  project_id: number | null;
  project_name: string;
  project_color: string;
  start: string;
  stop: string;
  duration: number;
  tags: string[];
  tag_ids: number[];
};

export type PinnedEntry = {
  id: string;
  description: string;
  project_name: string;
  project_color: string;
  tags: string[];
};

export type Project = {
  id: number;
  name: string;
  color: string;
};

export type Tag = {
  id: number;
  name: string;
};

export type SelectedCell = {
  rowIndex: number;
  cellIndex: number;
} | null;
