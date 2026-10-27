# Changelog

Every release is a tag `vX.Y.Z` with a section `## [X.Y.Z]` here; the release on GitHub gets that section as its notes
and `footer.tmpl` as its download. The version is also at the top of `footer.tmpl`.

## [1.1.0] - 2026-10-27

### Added
- Organisation (and user) project boards, under `/{owner}/-/projects`. They are read next to the repository's own
  boards, so their columns show up as badges and in the *Status* filter
  ([#1](https://github.com/Vandewaetere/gitea-board-badges/issues/1)).
- The version number at the top of `footer.tmpl`.

### Changed
- Cards are matched on repository and issue number. An organisation board can hold issues of several repositories, so
  `other-repo#5` no longer gives a badge to `this-repo#5`.

## [1.0.0] - 2026-10-23

First release.

- Badges with the board column of every issue and pull request in Gitea's issue lists, in the column's colour.
- A *Status* dropdown in the filter bar that filters the whole list, across all pages, including *No board*.
- Works on repository lists and on the global `/issues` overview; texts in English and Dutch.
