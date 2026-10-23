export class LinkType {
  static readonly values = [
    "advances", "tracks", "related_to", "mentions", "scheduled_at", "located_at",
  ] as const;

  static isValid(value: unknown): value is (typeof LinkType.values)[number] {
    return LinkType.values.some((type) => type === value);
  }

  static parse(value: unknown) {
    if (!LinkType.isValid(value)) throw new Error("Invalid Link type");
    return value;
  }
}
