/**
 * Example TypeScript file to test development tooling
 */

export interface ExampleInterface {
  id: number;
  name: string;
  isActive?: boolean;
}

export class ExampleClass {
  private readonly _id: number;
  private readonly _name: string;

  constructor(id: number, name: string) {
    this._id = id;
    this._name = name;
  }

  public getId(): number {
    return this._id;
  }

  public getName(): string {
    return this._name;
  }

  public processData(data: ExampleInterface[]): ExampleInterface[] {
    return data.filter(item => item.isActive ?? true);
  }
}
