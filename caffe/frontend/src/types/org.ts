export interface Branch {
  id: number;
  name: string | null;
  parentId: number;
  lat: string | null;
  lng: string | null;
}

export interface DeptNode {
  id: number;
  title: string | null;
  code: number | null;
  parentId: number;
  order: number | null;
  fromCode: number;
  toCode: number;
  children?: DeptNode[];
}

export interface JobTitle {
  id: number;
  name: string | null;
  parentId: number;
  edaraId: number;
  code: number | null;
  isTrainer?: boolean;
}
