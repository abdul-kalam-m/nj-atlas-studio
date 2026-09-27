"""Large layers split into one set of files per municipality (M7, DECISIONS.md D-025). See OPERATING_GUIDE.md §6.9."""
import re
from pathlib import Path

import pandas as pd

from pipeline.levels import MUNICIPALITY_LAYER
from pipeline.places import boundary_path

CODE = re.compile(r"^\d{4}$")


class PartitionError(ValueError):
    """A partition code is malformed, or the partitions cannot be listed."""


def is_partitioned(recipe: dict) -> bool:
    return bool(recipe.get("partition"))


def partition_codes(root: Path) -> list[str]:
    """Every municipal code, from the built municipalities layer."""
    path = boundary_path(root, MUNICIPALITY_LAYER)
    if not path.exists():
        raise PartitionError(f"Build {MUNICIPALITY_LAYER} first; partitions follow its municipal codes")
    return sorted(pd.read_parquet(path, columns=["mun_code"])["mun_code"].astype(str))


def check_code(code: str) -> str:
    if not CODE.match(str(code)):
        raise PartitionError(f"'{code}' is not a 4-digit municipal code")
    return str(code)


def partition_where(recipe: dict, code: str) -> str:
    """The source where clause narrowed to one municipality, e.g. (1=1) AND PCL_MUN = '1709'."""
    return f"({recipe['source']['where']}) AND {recipe['partition']['field']} = '{check_code(code)}'"


def file_base(recipe: dict, code: str) -> str:
    """Partition files are named <id>_<code>.<ext>, e.g. nj_parcels_1709.parquet."""
    return f"{recipe['id']}_{check_code(code)}"
