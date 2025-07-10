export type TimeEntry = {
  id: number;
  description: string;
  project_name: string;
  project_color: string;
  start: string;
  stop: string;
  duration: number;
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
