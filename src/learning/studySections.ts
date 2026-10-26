/** Split only at real assignment/concept headings, preserving original line offsets. */
export function studySections(markdown: string) {
  const lines = markdown.split("\n");
  const starts = [0];
  let fence = "";
  for (const [i, line] of lines.entries()) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = "";
      continue;
    }
    if (
      !fence &&
      i &&
      (/^## /.test(line) ||
        (/^### /.test(line) &&
          /^Task [1-9]\d*\.?\s*$/.test(
            lines.slice(i + 1).find((x) => x.trim()) ?? "",
          )))
    )
      starts.push(i);
  }
  return starts.map((start, i) => {
    const text = lines.slice(start, starts[i + 1]).join("\n");
    const taskIds = [...text.matchAll(/\bTask ([1-9]\d*)\b/g)].map((m) =>
      Number(m[1]),
    );
    return {
      key: `section-${start + 1}`,
      text,
      line: start + 1,
      taskIds: [...new Set(taskIds)],
      title: lines[start]?.replace(/^#+\s*/, "") ?? "",
    };
  });
}

export function withStudyAdditions(
  markdown: string,
  additions: { section: string; markdown: string }[],
) {
  return studySections(markdown)
    .map((section) => {
      const extra = additions.filter((a) => a.section === section.key);
      return (
        section.text +
        extra
          .map((a, i) => `\n\n#### More detail ${i + 1}\n\n${a.markdown}`)
          .join("")
      );
    })
    .join("\n");
}
