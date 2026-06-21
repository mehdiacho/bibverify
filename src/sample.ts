// A small sample with: a correct DOI, an entry with a wrong author/journal
// (to show the diff), and an entry with no DOI (to show the prompt).
export const SAMPLE_BIB = String.raw`@article{aspelmeyer2009,
  title   = {Measured measurement},
  author  = {Aspelmeyer, M.},
  journal = {Nature},
  year    = {2009},
  doi     = {10.1038/nphys1170}
}

@article{attention2017,
  title   = {Attention Is All You Need},
  author  = {Vaswani, Ashish and others},
  year    = {2017},
  doi     = {10.48550/arXiv.1706.03762}
}

@book{knuth1984,
  title     = {The TeXbook},
  author    = {Knuth, Donald E.},
  publisher = {Addison-Wesley},
  year      = {1984}
}
`;
